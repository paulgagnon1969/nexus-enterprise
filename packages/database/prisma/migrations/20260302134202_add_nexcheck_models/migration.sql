-- CreateEnum
CREATE TYPE "SiteDocCategory" AS ENUM ('JSA', 'ONBOARDING', 'SAFETY', 'POLICY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SiteDocFrequency" AS ENUM ('ONCE', 'DAILY', 'ON_CHANGE');

-- CreateEnum
CREATE TYPE "SignOutMethod" AS ENUM ('MANUAL', 'SYSTEM_AUTO_SIGNOUT', 'SYSTEM_EOD_SIGNOUT');

-- CreateTable
CREATE TABLE "SitePass" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "workerId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "companyName" TEXT,
    "trade" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SitePass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "category" "SiteDocCategory" NOT NULL DEFAULT 'CUSTOM',
    "frequency" "SiteDocFrequency" NOT NULL DEFAULT 'DAILY',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceDocId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteDocumentAck" (
    "id" TEXT NOT NULL,
    "siteDocumentId" TEXT NOT NULL,
    "sitePassId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentVersion" INTEGER NOT NULL,
    "checkInSessionId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteDocumentAck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteCheckIn" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sitePassId" TEXT NOT NULL,
    "kioskSessionId" TEXT,
    "checkInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signOutAt" TIMESTAMP(3),
    "signOutMethod" "SignOutMethod",
    "signatureSvg" TEXT,
    "documentsAcked" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KioskSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "activatedByUserId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "KioskSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KioskDelegation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "delegatedToUserId" TEXT NOT NULL,
    "delegatedByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KioskDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SitePass_tokenHash_key" ON "SitePass"("tokenHash");

-- CreateIndex
CREATE INDEX "SitePass_company_idx" ON "SitePass"("companyId");

-- CreateIndex
CREATE INDEX "SitePass_user_idx" ON "SitePass"("userId");

-- CreateIndex
CREATE INDEX "SitePass_worker_idx" ON "SitePass"("workerId");

-- CreateIndex
CREATE INDEX "SiteDocument_company_project_idx" ON "SiteDocument"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "SiteDocument_project_active_idx" ON "SiteDocument"("projectId", "isActive");

-- CreateIndex
CREATE INDEX "SiteDocumentAck_doc_pass_idx" ON "SiteDocumentAck"("siteDocumentId", "sitePassId");

-- CreateIndex
CREATE INDEX "SiteDocumentAck_pass_time_idx" ON "SiteDocumentAck"("sitePassId", "acknowledgedAt");

-- CreateIndex
CREATE INDEX "SiteDocumentAck_checkin_idx" ON "SiteDocumentAck"("checkInSessionId");

-- CreateIndex
CREATE INDEX "SiteCheckIn_company_project_time_idx" ON "SiteCheckIn"("companyId", "projectId", "checkInAt");

-- CreateIndex
CREATE INDEX "SiteCheckIn_pass_time_idx" ON "SiteCheckIn"("sitePassId", "checkInAt");

-- CreateIndex
CREATE INDEX "SiteCheckIn_kiosk_idx" ON "SiteCheckIn"("kioskSessionId");

-- CreateIndex
CREATE INDEX "SiteCheckIn_project_time_idx" ON "SiteCheckIn"("projectId", "checkInAt");

-- CreateIndex
CREATE INDEX "KioskSession_company_project_idx" ON "KioskSession"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "KioskSession_device_active_idx" ON "KioskSession"("deviceId", "isActive");

-- CreateIndex
CREATE INDEX "KioskDelegation_company_project_idx" ON "KioskDelegation"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "KioskDelegation_delegate_expiry_idx" ON "KioskDelegation"("delegatedToUserId", "expiresAt");

-- AddForeignKey
ALTER TABLE "SitePass" ADD CONSTRAINT "SitePass_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePass" ADD CONSTRAINT "SitePass_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePass" ADD CONSTRAINT "SitePass_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDocument" ADD CONSTRAINT "SiteDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDocument" ADD CONSTRAINT "SiteDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDocument" ADD CONSTRAINT "SiteDocument_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDocumentAck" ADD CONSTRAINT "SiteDocumentAck_siteDocumentId_fkey" FOREIGN KEY ("siteDocumentId") REFERENCES "SiteDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDocumentAck" ADD CONSTRAINT "SiteDocumentAck_sitePassId_fkey" FOREIGN KEY ("sitePassId") REFERENCES "SitePass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDocumentAck" ADD CONSTRAINT "SiteDocumentAck_checkInSessionId_fkey" FOREIGN KEY ("checkInSessionId") REFERENCES "SiteCheckIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteCheckIn" ADD CONSTRAINT "SiteCheckIn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteCheckIn" ADD CONSTRAINT "SiteCheckIn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteCheckIn" ADD CONSTRAINT "SiteCheckIn_sitePassId_fkey" FOREIGN KEY ("sitePassId") REFERENCES "SitePass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteCheckIn" ADD CONSTRAINT "SiteCheckIn_kioskSessionId_fkey" FOREIGN KEY ("kioskSessionId") REFERENCES "KioskSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskSession" ADD CONSTRAINT "KioskSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskSession" ADD CONSTRAINT "KioskSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskSession" ADD CONSTRAINT "KioskSession_activatedByUserId_fkey" FOREIGN KEY ("activatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskDelegation" ADD CONSTRAINT "KioskDelegation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskDelegation" ADD CONSTRAINT "KioskDelegation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskDelegation" ADD CONSTRAINT "KioskDelegation_delegatedToUserId_fkey" FOREIGN KEY ("delegatedToUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskDelegation" ADD CONSTRAINT "KioskDelegation_delegatedByUserId_fkey" FOREIGN KEY ("delegatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
