-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "ShareDocumentType" ADD VALUE 'SECURE_PORTAL';

-- AlterTable
ALTER TABLE "DocumentShareToken" ADD COLUMN     "campaignId" TEXT;

-- CreateTable
CREATE TABLE "CndaTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CndaTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurePortalCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "cndaTemplateId" TEXT NOT NULL,
    "questionnaireEnabled" BOOLEAN NOT NULL DEFAULT true,
    "questionnaireConfig" JSONB,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurePortalCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignDocument" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "systemDocumentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CampaignDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CndaTemplate_active_idx" ON "CndaTemplate"("active");

-- CreateIndex
CREATE UNIQUE INDEX "SecurePortalCampaign_slug_key" ON "SecurePortalCampaign"("slug");

-- CreateIndex
CREATE INDEX "SecurePortalCampaign_status_idx" ON "SecurePortalCampaign"("status");

-- CreateIndex
CREATE INDEX "SecurePortalCampaign_cnda_idx" ON "SecurePortalCampaign"("cndaTemplateId");

-- CreateIndex
CREATE INDEX "CampaignDocument_campaign_sort_idx" ON "CampaignDocument"("campaignId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignDocument_campaignId_systemDocumentId_key" ON "CampaignDocument"("campaignId", "systemDocumentId");

-- CreateIndex
CREATE INDEX "DocShareToken_campaign_idx" ON "DocumentShareToken"("campaignId");

-- AddForeignKey
ALTER TABLE "CndaTemplate" ADD CONSTRAINT "CndaTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurePortalCampaign" ADD CONSTRAINT "SecurePortalCampaign_cndaTemplateId_fkey" FOREIGN KEY ("cndaTemplateId") REFERENCES "CndaTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurePortalCampaign" ADD CONSTRAINT "SecurePortalCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDocument" ADD CONSTRAINT "CampaignDocument_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SecurePortalCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDocument" ADD CONSTRAINT "CampaignDocument_systemDocumentId_fkey" FOREIGN KEY ("systemDocumentId") REFERENCES "SystemDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShareToken" ADD CONSTRAINT "DocumentShareToken_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SecurePortalCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
