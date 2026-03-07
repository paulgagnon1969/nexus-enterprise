-- CreateEnum
CREATE TYPE "public"."DeviceLicenseType" AS ENUM ('CLOUD_SUBSCRIPTION', 'STANDALONE', 'STANDALONE_WITH_UPDATES', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."InvoicePaymentIntentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."PrescreenFeedbackType" AS ENUM ('ACCEPTED', 'REJECTED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "public"."PrescreenStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "public"."SupportSessionEventType" AS ENUM ('CREATED', 'CLIENT_JOINED', 'AGENT_JOINED', 'CONTROL_REQUESTED', 'CONTROL_GRANTED', 'CONTROL_REVOKED', 'ENDED');

-- CreateEnum
CREATE TYPE "public"."SupportSessionMode" AS ENUM ('VIEW_ONLY', 'REMOTE_CONTROL');

-- CreateEnum
CREATE TYPE "public"."SupportSessionStatus" AS ENUM ('PENDING', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "public"."SupportTicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "public"."SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- AlterEnum
ALTER TYPE "public"."ProjectBillStatus" ADD VALUE 'TENTATIVE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."ProjectPaymentMethod" ADD VALUE 'CARD';
ALTER TYPE "public"."ProjectPaymentMethod" ADD VALUE 'STRIPE_ACH';

-- AlterTable
ALTER TABLE "public"."ImportedTransaction" ADD COLUMN     "prescreenConfidence" DOUBLE PRECISION,
ADD COLUMN     "prescreenProjectId" TEXT,
ADD COLUMN     "prescreenReason" TEXT,
ADD COLUMN     "prescreenRejectionReason" TEXT,
ADD COLUMN     "prescreenStatus" "public"."PrescreenStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "reconciledAt" TIMESTAMP(3),
ADD COLUMN     "reconciledWithId" TEXT,
ADD COLUMN     "registerNumber" TEXT,
ADD COLUMN     "storeNumber" TEXT,
ADD COLUMN     "transactionRef" TEXT;

-- AlterTable
ALTER TABLE "public"."ModuleCatalog" ADD COLUMN     "prerequisites" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "public"."ProjectBill" ADD COLUMN     "prescreenConfidence" DOUBLE PRECISION,
ADD COLUMN     "sourceTransactionId" TEXT,
ADD COLUMN     "sourceTransactionSource" TEXT;

-- AlterTable
ALTER TABLE "public"."ProjectInvoice" ADD COLUMN     "paymentToken" TEXT,
ADD COLUMN     "paymentTokenExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN     "completedByUserId" TEXT;

-- CreateTable
CREATE TABLE "public"."InvoicePaymentIntent" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT NOT NULL,
    "payerEmail" TEXT,
    "payerName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoicePaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PrescreenFeedback" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "prescreenProjectId" TEXT,
    "actualProjectId" TEXT,
    "feedbackType" "public"."PrescreenFeedbackType" NOT NULL,
    "reason" TEXT,
    "source" TEXT,
    "merchant" TEXT,
    "jobNameNormalized" TEXT,
    "storeNumber" TEXT,
    "purchaser" TEXT,
    "descriptionKeywords" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescreenFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupportSession" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "sessionCode" TEXT NOT NULL,
    "status" "public"."SupportSessionStatus" NOT NULL DEFAULT 'PENDING',
    "mode" "public"."SupportSessionMode" NOT NULL DEFAULT 'VIEW_ONLY',
    "clientUserId" TEXT NOT NULL,
    "agentUserId" TEXT,
    "clientIp" TEXT,
    "agentIp" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastHeartbeat" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupportSessionEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventType" "public"."SupportSessionEventType" NOT NULL,
    "actorUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportSessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupportTicket" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "status" "public"."SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "public"."SupportTicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskGroupMember" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceName" TEXT,
    "appVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "licenseType" "public"."DeviceLicenseType" NOT NULL DEFAULT 'CLOUD_SUBSCRIPTION',
    "licenseExpiresAt" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "exportCompletedAt" TIMESTAMP(3),

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoicePaymentIntent_company_idx" ON "public"."InvoicePaymentIntent"("companyId" ASC);

-- CreateIndex
CREATE INDEX "InvoicePaymentIntent_invoice_idx" ON "public"."InvoicePaymentIntent"("invoiceId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePaymentIntent_stripePaymentIntentId_key" ON "public"."InvoicePaymentIntent"("stripePaymentIntentId" ASC);

-- CreateIndex
CREATE INDEX "PrescreenFeedback_company_jobName_idx" ON "public"."PrescreenFeedback"("companyId" ASC, "jobNameNormalized" ASC);

-- CreateIndex
CREATE INDEX "PrescreenFeedback_company_source_merchant_idx" ON "public"."PrescreenFeedback"("companyId" ASC, "source" ASC, "merchant" ASC);

-- CreateIndex
CREATE INDEX "PrescreenFeedback_company_store_idx" ON "public"."PrescreenFeedback"("companyId" ASC, "storeNumber" ASC);

-- CreateIndex
CREATE INDEX "SupportSession_code_idx" ON "public"."SupportSession"("sessionCode" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SupportSession_sessionCode_key" ON "public"."SupportSession"("sessionCode" ASC);

-- CreateIndex
CREATE INDEX "SupportSession_status_heartbeat_idx" ON "public"."SupportSession"("status" ASC, "lastHeartbeat" ASC);

-- CreateIndex
CREATE INDEX "SupportSession_ticket_idx" ON "public"."SupportSession"("ticketId" ASC);

-- CreateIndex
CREATE INDEX "SupportSessionEvent_session_created_idx" ON "public"."SupportSessionEvent"("sessionId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "SupportTicket_assignee_status_idx" ON "public"."SupportTicket"("assignedToId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "SupportTicket_company_status_created_idx" ON "public"."SupportTicket"("companyId" ASC, "status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "SupportTicket_creator_created_idx" ON "public"."SupportTicket"("createdById" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TaskGroupMember_taskId_userId_key" ON "public"."TaskGroupMember"("taskId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "TaskGroupMember_user_idx" ON "public"."TaskGroupMember"("userId" ASC);

-- CreateIndex
CREATE INDEX "UserDevice_companyId_idx" ON "public"."UserDevice"("companyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_userId_deviceId_key" ON "public"."UserDevice"("userId" ASC, "deviceId" ASC);

-- CreateIndex
CREATE INDEX "UserDevice_userId_idx" ON "public"."UserDevice"("userId" ASC);

-- CreateIndex
CREATE INDEX "ImportedTransaction_company_prescreen_idx" ON "public"."ImportedTransaction"("companyId" ASC, "prescreenStatus" ASC);

-- CreateIndex
CREATE INDEX "ImportedTransaction_company_store_idx" ON "public"."ImportedTransaction"("companyId" ASC, "storeNumber" ASC);

-- CreateIndex
CREATE INDEX "ImportedTransaction_reconciledWith_idx" ON "public"."ImportedTransaction"("reconciledWithId" ASC);

-- CreateIndex
CREATE INDEX "ProjectBill_project_status_idx" ON "public"."ProjectBill"("projectId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "ProjectBill_source_transaction_idx" ON "public"."ProjectBill"("sourceTransactionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInvoice_paymentToken_key" ON "public"."ProjectInvoice"("paymentToken" ASC);

-- AddForeignKey
ALTER TABLE "public"."ImportedTransaction" ADD CONSTRAINT "ImportedTransaction_prescreenProjectId_fkey" FOREIGN KEY ("prescreenProjectId") REFERENCES "public"."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoicePaymentIntent" ADD CONSTRAINT "InvoicePaymentIntent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoicePaymentIntent" ADD CONSTRAINT "InvoicePaymentIntent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."ProjectInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoicePaymentIntent" ADD CONSTRAINT "InvoicePaymentIntent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PrescreenFeedback" ADD CONSTRAINT "PrescreenFeedback_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupportSession" ADD CONSTRAINT "SupportSession_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupportSession" ADD CONSTRAINT "SupportSession_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupportSession" ADD CONSTRAINT "SupportSession_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupportSessionEvent" ADD CONSTRAINT "SupportSessionEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupportSessionEvent" ADD CONSTRAINT "SupportSessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."SupportSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupportTicket" ADD CONSTRAINT "SupportTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupportTicket" ADD CONSTRAINT "SupportTicket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupportTicket" ADD CONSTRAINT "SupportTicket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskGroupMember" ADD CONSTRAINT "TaskGroupMember_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskGroupMember" ADD CONSTRAINT "TaskGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserDevice" ADD CONSTRAINT "UserDevice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "public"."AdjustmentReasonType_company_slug_key" RENAME TO "AdjustmentReasonType_companyId_slug_key";

-- RenameIndex
ALTER INDEX "public"."DuplicateExpenseDisposition_company_group_key" RENAME TO "DuplicateExpenseDisposition_companyId_groupId_key";

-- RenameIndex
ALTER INDEX "public"."MerchantCategoryRule_company_merchant_from_key" RENAME TO "MerchantCategoryRule_companyId_merchantKey_fromCategory_key";

