-- CreateEnum
CREATE TYPE "EmailReceiptConnectorStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR', 'DISCONNECTED');

-- AlterTable
ALTER TABLE "EmailReceipt" ADD COLUMN     "connectorId" TEXT;

-- CreateTable
CREATE TABLE "EmailReceiptConnector" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "imapHost" TEXT NOT NULL,
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "imapUser" TEXT NOT NULL,
    "imapPasswordEncrypted" BYTEA NOT NULL,
    "imapMailbox" TEXT NOT NULL DEFAULT 'INBOX',
    "status" "EmailReceiptConnectorStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastPolledAt" TIMESTAMP(3),
    "lastPollError" TEXT,
    "totalReceiptsIngested" INTEGER NOT NULL DEFAULT 0,
    "connectedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailReceiptConnector_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailReceiptConnector_company_status_idx" ON "EmailReceiptConnector"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmailReceiptConnector_companyId_imapUser_imapMailbox_key" ON "EmailReceiptConnector"("companyId", "imapUser", "imapMailbox");

-- CreateIndex
CREATE INDEX "EmailReceipt_connector_idx" ON "EmailReceipt"("connectorId");

-- AddForeignKey
ALTER TABLE "EmailReceipt" ADD CONSTRAINT "EmailReceipt_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "EmailReceiptConnector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailReceiptConnector" ADD CONSTRAINT "EmailReceiptConnector_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailReceiptConnector" ADD CONSTRAINT "EmailReceiptConnector_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
