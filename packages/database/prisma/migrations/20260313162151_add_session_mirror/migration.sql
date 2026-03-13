-- CreateEnum
CREATE TYPE "DevSessionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'AWAITING_REVIEW', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DevSessionEventType" AS ENUM ('FILE_CHANGED', 'COMMAND_RUN', 'DECISION', 'APPROVAL_REQUESTED', 'APPROVAL_RESOLVED', 'COMMENT', 'MILESTONE', 'STATUS_CHANGE');

-- CreateEnum
CREATE TYPE "DevApprovalRequestType" AS ENUM ('DEPLOY', 'SCHEMA_CHANGE', 'DESTRUCTIVE_ACTION', 'CODE_REVIEW', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DevApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "DevSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "DevSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "sessionCode" TEXT NOT NULL,
    "lastHeartbeat" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevSessionEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventType" "DevSessionEventType" NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" JSONB,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevSessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevApprovalRequest" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "requestType" "DevApprovalRequestType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "detail" JSONB,
    "status" "DevApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolverComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DevSession_sessionCode_key" ON "DevSession"("sessionCode");

-- CreateIndex
CREATE INDEX "DevSession_company_status_created_idx" ON "DevSession"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DevSession_code_idx" ON "DevSession"("sessionCode");

-- CreateIndex
CREATE INDEX "DevSession_creator_created_idx" ON "DevSession"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "DevSessionEvent_session_created_idx" ON "DevSessionEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DevApprovalRequest_eventId_key" ON "DevApprovalRequest"("eventId");

-- CreateIndex
CREATE INDEX "DevApproval_session_status_idx" ON "DevApprovalRequest"("sessionId", "status");

-- AddForeignKey
ALTER TABLE "DevSession" ADD CONSTRAINT "DevSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevSession" ADD CONSTRAINT "DevSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevSessionEvent" ADD CONSTRAINT "DevSessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DevSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevSessionEvent" ADD CONSTRAINT "DevSessionEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevApprovalRequest" ADD CONSTRAINT "DevApprovalRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DevSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevApprovalRequest" ADD CONSTRAINT "DevApprovalRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "DevSessionEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevApprovalRequest" ADD CONSTRAINT "DevApprovalRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
