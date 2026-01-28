-- CreateEnum
CREATE TYPE "PetlPercentUpdateSessionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PetlPercentUpdateTargetType" AS ENUM ('SOW_ITEM', 'RECON_ENTRY');

-- CreateTable
CREATE TABLE "PetlPercentUpdateSession" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'field',
    "metaJson" JSONB,
    "status" "PetlPercentUpdateSessionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,

    CONSTRAINT "PetlPercentUpdateSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetlPercentUpdate" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "targetType" "PetlPercentUpdateTargetType" NOT NULL,
    "sowItemId" TEXT,
    "reconEntryId" TEXT,
    "oldPercent" DOUBLE PRECISION NOT NULL,
    "newPercent" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetlPercentUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PetlPercentUpdateSession_project_status_created_idx" ON "PetlPercentUpdateSession"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PetlPercentUpdate_session_idx" ON "PetlPercentUpdate"("sessionId");

-- CreateIndex
CREATE INDEX "PetlPercentUpdate_sowItem_idx" ON "PetlPercentUpdate"("sowItemId");

-- CreateIndex
CREATE INDEX "PetlPercentUpdate_reconEntry_idx" ON "PetlPercentUpdate"("reconEntryId");

-- AddForeignKey
ALTER TABLE "PetlPercentUpdateSession" ADD CONSTRAINT "PetlPercentUpdateSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlPercentUpdateSession" ADD CONSTRAINT "PetlPercentUpdateSession_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlPercentUpdateSession" ADD CONSTRAINT "PetlPercentUpdateSession_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlPercentUpdateSession" ADD CONSTRAINT "PetlPercentUpdateSession_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlPercentUpdate" ADD CONSTRAINT "PetlPercentUpdate_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PetlPercentUpdateSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlPercentUpdate" ADD CONSTRAINT "PetlPercentUpdate_sowItemId_fkey" FOREIGN KEY ("sowItemId") REFERENCES "SowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlPercentUpdate" ADD CONSTRAINT "PetlPercentUpdate_reconEntryId_fkey" FOREIGN KEY ("reconEntryId") REFERENCES "PetlReconciliationEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
