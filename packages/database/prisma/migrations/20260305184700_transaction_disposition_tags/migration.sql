-- CreateEnum
CREATE TYPE "TransactionDisposition" AS ENUM ('UNREVIEWED', 'PENDING_APPROVAL', 'ASSIGNED', 'IGNORED', 'PERSONAL', 'DUPLICATE', 'RETURNED');

-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "disposition" "TransactionDisposition" NOT NULL DEFAULT 'UNREVIEWED';

-- AlterTable
ALTER TABLE "ImportedTransaction" ADD COLUMN     "disposition" "TransactionDisposition" NOT NULL DEFAULT 'UNREVIEWED';

-- CreateTable
CREATE TABLE "TransactionDispositionLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "transactionSource" TEXT NOT NULL,
    "previousDisposition" "TransactionDisposition" NOT NULL,
    "newDisposition" "TransactionDisposition" NOT NULL,
    "note" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionDispositionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionTag" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionTagAssignment" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "transactionSource" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "assignedByUserId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionTagAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TxnDispositionLog_company_txn_idx" ON "TransactionDispositionLog"("companyId", "transactionId");

-- CreateIndex
CREATE INDEX "TxnDispositionLog_company_date_idx" ON "TransactionDispositionLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "TransactionTag_company_idx" ON "TransactionTag"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionTag_companyId_name_key" ON "TransactionTag"("companyId", "name");

-- CreateIndex
CREATE INDEX "TransactionTagAssignment_tag_idx" ON "TransactionTagAssignment"("tagId");

-- CreateIndex
CREATE INDEX "TransactionTagAssignment_txn_idx" ON "TransactionTagAssignment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionTagAssignment_transactionId_tagId_key" ON "TransactionTagAssignment"("transactionId", "tagId");

-- CreateIndex
CREATE INDEX "BankTransaction_company_disposition_idx" ON "BankTransaction"("companyId", "disposition");

-- CreateIndex
CREATE INDEX "ImportedTransaction_company_disposition_idx" ON "ImportedTransaction"("companyId", "disposition");

-- AddForeignKey
ALTER TABLE "TransactionDispositionLog" ADD CONSTRAINT "TransactionDispositionLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionDispositionLog" ADD CONSTRAINT "TransactionDispositionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTag" ADD CONSTRAINT "TransactionTag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTagAssignment" ADD CONSTRAINT "TransactionTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TransactionTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
