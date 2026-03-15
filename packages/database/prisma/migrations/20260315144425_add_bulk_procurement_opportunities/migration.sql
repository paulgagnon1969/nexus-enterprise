-- CreateEnum
CREATE TYPE "BulkOpportunityStatus" AS ENUM ('DETECTED', 'NOTIFIED', 'REVIEWING', 'APPROVED', 'PURCHASING', 'COMPLETED', 'DISMISSED');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'BULK_PROCUREMENT';

-- CreateTable
CREATE TABLE "BulkProcurementOpportunity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "BulkOpportunityStatus" NOT NULL DEFAULT 'DETECTED',
    "title" TEXT NOT NULL,
    "clusterKey" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "dismissedByUserId" TEXT,
    "dismissReason" TEXT,
    "totalProjectCount" INTEGER NOT NULL DEFAULT 0,
    "totalLineItemCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedTotalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedSavingsPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkProcurementOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkOpportunityProject" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "materialLineCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BulkOpportunityProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkOpportunityLineItem" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryCode" TEXT,
    "selectionCode" TEXT,
    "activity" TEXT,
    "unit" TEXT,
    "totalQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedTotalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "projectCount" INTEGER NOT NULL DEFAULT 0,
    "projectBreakdownJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BulkOpportunityLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkOpportunity_company_status_idx" ON "BulkProcurementOpportunity"("companyId", "status");

-- CreateIndex
CREATE INDEX "BulkOpportunity_company_cluster_status_idx" ON "BulkProcurementOpportunity"("companyId", "clusterKey", "status");

-- CreateIndex
CREATE INDEX "BulkOpportunity_expires_idx" ON "BulkProcurementOpportunity"("expiresAt");

-- CreateIndex
CREATE INDEX "BulkOpportunityProject_project_idx" ON "BulkOpportunityProject"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "BulkOpportunityProject_opportunityId_projectId_key" ON "BulkOpportunityProject"("opportunityId", "projectId");

-- CreateIndex
CREATE INDEX "BulkOpportunityLine_opp_key_idx" ON "BulkOpportunityLineItem"("opportunityId", "normalizedKey");

-- CreateIndex
CREATE INDEX "BulkOpportunityLine_opp_cost_idx" ON "BulkOpportunityLineItem"("opportunityId", "estimatedTotalCost");

-- AddForeignKey
ALTER TABLE "BulkProcurementOpportunity" ADD CONSTRAINT "BulkProcurementOpportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkProcurementOpportunity" ADD CONSTRAINT "BulkProcurementOpportunity_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkProcurementOpportunity" ADD CONSTRAINT "BulkProcurementOpportunity_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkProcurementOpportunity" ADD CONSTRAINT "BulkProcurementOpportunity_dismissedByUserId_fkey" FOREIGN KEY ("dismissedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkOpportunityProject" ADD CONSTRAINT "BulkOpportunityProject_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "BulkProcurementOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkOpportunityProject" ADD CONSTRAINT "BulkOpportunityProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkOpportunityLineItem" ADD CONSTRAINT "BulkOpportunityLineItem_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "BulkProcurementOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
