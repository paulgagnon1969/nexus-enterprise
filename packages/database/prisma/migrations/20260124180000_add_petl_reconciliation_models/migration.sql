-- CreateEnum
CREATE TYPE "PetlReconciliationCaseStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PetlReconciliationEntryKind" AS ENUM ('NOTE_ONLY', 'CREDIT', 'ADD', 'CHANGE_ORDER_CLIENT_PAY', 'REIMBURSE_OWNER');

-- CreateTable
CREATE TABLE "PetlReconciliationCase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "sowItemId" TEXT,
    "logicalItemId" TEXT,
    "noteThreadId" TEXT,
    "status" "PetlReconciliationCaseStatus" NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetlReconciliationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetlReconciliationEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "parentSowItemId" TEXT,
    "projectParticleId" TEXT NOT NULL,
    "kind" "PetlReconciliationEntryKind" NOT NULL DEFAULT 'NOTE_ONLY',
    "description" TEXT,
    "categoryCode" TEXT,
    "selectionCode" TEXT,
    "unit" TEXT,
    "qty" DOUBLE PRECISION,
    "unitCost" DOUBLE PRECISION,
    "itemAmount" DOUBLE PRECISION,
    "salesTaxAmount" DOUBLE PRECISION,
    "opAmount" DOUBLE PRECISION,
    "rcvAmount" DOUBLE PRECISION,
    "rcvComponentsJson" JSONB,
    "percentComplete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPercentCompleteLocked" BOOLEAN NOT NULL DEFAULT false,
    "companyPriceListItemId" TEXT,
    "sourceSnapshotJson" JSONB,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetlReconciliationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetlReconciliationEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "entryId" TEXT,
    "eventType" TEXT NOT NULL,
    "payloadJson" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetlReconciliationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PetlReconCase_project_logical_key" ON "PetlReconciliationCase"("projectId", "logicalItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PetlReconCase_project_sow_key" ON "PetlReconciliationCase"("projectId", "sowItemId");

-- CreateIndex
CREATE INDEX "PetlReconCase_project_estimate_idx" ON "PetlReconciliationCase"("projectId", "estimateVersionId");

-- CreateIndex
CREATE INDEX "PetlReconEntry_project_estimate_idx" ON "PetlReconciliationEntry"("projectId", "estimateVersionId");

-- CreateIndex
CREATE INDEX "PetlReconEntry_case_idx" ON "PetlReconciliationEntry"("caseId");

-- CreateIndex
CREATE INDEX "PetlReconEntry_particle_idx" ON "PetlReconciliationEntry"("projectParticleId");

-- CreateIndex
CREATE INDEX "PetlReconEvent_project_estimate_created_idx" ON "PetlReconciliationEvent"("projectId", "estimateVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "PetlReconEvent_case_created_idx" ON "PetlReconciliationEvent"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "PetlReconEvent_entry_idx" ON "PetlReconciliationEvent"("entryId");

-- AddForeignKey
ALTER TABLE "PetlReconciliationCase" ADD CONSTRAINT "PetlReconciliationCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlReconciliationCase" ADD CONSTRAINT "PetlReconciliationCase_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlReconciliationCase" ADD CONSTRAINT "PetlReconciliationCase_sowItemId_fkey" FOREIGN KEY ("sowItemId") REFERENCES "SowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlReconciliationCase" ADD CONSTRAINT "PetlReconciliationCase_logicalItemId_fkey" FOREIGN KEY ("logicalItemId") REFERENCES "SowLogicalItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlReconciliationCase" ADD CONSTRAINT "PetlReconciliationCase_noteThreadId_fkey" FOREIGN KEY ("noteThreadId") REFERENCES "MessageThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlReconciliationCase" ADD CONSTRAINT "PetlReconciliationCase_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlReconciliationEntry" ADD CONSTRAINT "PetlReconciliationEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlReconciliationEntry" ADD CONSTRAINT "PetlReconciliationEntry_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlReconciliationEntry" ADD CONSTRAINT "PetlReconciliationEntry_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "PetlReconciliationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlReconciliationEntry" ADD CONSTRAINT "PetlReconciliationEntry_parentSowItemId_fkey" FOREIGN KEY ("parentSowItemId") REFERENCES "SowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlReconciliationEntry" ADD CONSTRAINT "PetlReconciliationEntry_projectParticleId_fkey" FOREIGN KEY ("projectParticleId") REFERENCES "ProjectParticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlReconciliationEntry" ADD CONSTRAINT "PetlReconciliationEntry_companyPriceListItemId_fkey" FOREIGN KEY ("companyPriceListItemId") REFERENCES "CompanyPriceListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlReconciliationEntry" ADD CONSTRAINT "PetlReconciliationEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlReconciliationEvent" ADD CONSTRAINT "PetlReconciliationEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlReconciliationEvent" ADD CONSTRAINT "PetlReconciliationEvent_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlReconciliationEvent" ADD CONSTRAINT "PetlReconciliationEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "PetlReconciliationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlReconciliationEvent" ADD CONSTRAINT "PetlReconciliationEvent_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PetlReconciliationEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlReconciliationEvent" ADD CONSTRAINT "PetlReconciliationEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
