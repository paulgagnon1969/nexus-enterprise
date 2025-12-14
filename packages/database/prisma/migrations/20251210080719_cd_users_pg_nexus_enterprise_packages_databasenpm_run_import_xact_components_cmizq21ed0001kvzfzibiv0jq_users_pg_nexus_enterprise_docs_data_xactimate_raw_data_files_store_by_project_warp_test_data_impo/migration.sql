-- CreateTable
CREATE TABLE "RawComponentRow" (
    "id" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "taxStatus" TEXT,
    "contractorSuppliedRaw" TEXT,
    "quantityRaw" TEXT,
    "unitRaw" TEXT,
    "unitPriceRaw" TEXT,
    "totalRaw" TEXT,
    "requestThirdPartyPricingRaw" TEXT,
    "rawRowJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawComponentRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentSummary" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "taxStatus" TEXT,
    "contractorSupplied" BOOLEAN,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "unitPrice" DOUBLE PRECISION,
    "total" DOUBLE PRECISION,
    "requestThirdPartyPricing" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComponentSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SowComponentAllocation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "sowItemId" TEXT NOT NULL,
    "componentSummaryId" TEXT,
    "code" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "total" DOUBLE PRECISION,
    "allocationBasis" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SowComponentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentAllocationRule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT,
    "componentCode" TEXT NOT NULL,
    "targetCategoryCode" TEXT,
    "targetActivity" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComponentAllocationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RawComponentRow_estimate_idx" ON "RawComponentRow"("estimateVersionId");

-- CreateIndex
CREATE INDEX "ComponentSummary_project_estimate_code_idx" ON "ComponentSummary"("projectId", "estimateVersionId", "code");

-- CreateIndex
CREATE INDEX "SowComponentAllocation_project_estimate_code_idx" ON "SowComponentAllocation"("projectId", "estimateVersionId", "code");

-- CreateIndex
CREATE INDEX "SowComponentAllocation_sowItem_idx" ON "SowComponentAllocation"("sowItemId");

-- CreateIndex
CREATE INDEX "ComponentAllocationRule_project_code_idx" ON "ComponentAllocationRule"("projectId", "componentCode");

-- CreateIndex
CREATE INDEX "ComponentAllocationRule_estimate_idx" ON "ComponentAllocationRule"("estimateVersionId");

-- AddForeignKey
ALTER TABLE "RawComponentRow" ADD CONSTRAINT "RawComponentRow_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentSummary" ADD CONSTRAINT "ComponentSummary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentSummary" ADD CONSTRAINT "ComponentSummary_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SowComponentAllocation" ADD CONSTRAINT "SowComponentAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SowComponentAllocation" ADD CONSTRAINT "SowComponentAllocation_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SowComponentAllocation" ADD CONSTRAINT "SowComponentAllocation_sowItemId_fkey" FOREIGN KEY ("sowItemId") REFERENCES "SowItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SowComponentAllocation" ADD CONSTRAINT "SowComponentAllocation_componentSummaryId_fkey" FOREIGN KEY ("componentSummaryId") REFERENCES "ComponentSummary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentAllocationRule" ADD CONSTRAINT "ComponentAllocationRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentAllocationRule" ADD CONSTRAINT "ComponentAllocationRule_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
