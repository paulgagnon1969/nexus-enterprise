-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('MONTHLY', 'PER_PROJECT', 'PER_USE');

-- AlterTable
ALTER TABLE "ModuleCatalog" ADD COLUMN     "pricingModel" "PricingModel" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "projectUnlockPrice" INTEGER;

-- CreateTable
CREATE TABLE "ProjectFeatureUnlock" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "featureCode" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "unlockedByUserId" TEXT,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectFeatureUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectFeatureUnlock_company_idx" ON "ProjectFeatureUnlock"("companyId");

-- CreateIndex
CREATE INDEX "ProjectFeatureUnlock_project_idx" ON "ProjectFeatureUnlock"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFeatureUnlock_companyId_projectId_featureCode_key" ON "ProjectFeatureUnlock"("companyId", "projectId", "featureCode");

-- AddForeignKey
ALTER TABLE "ProjectFeatureUnlock" ADD CONSTRAINT "ProjectFeatureUnlock_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFeatureUnlock" ADD CONSTRAINT "ProjectFeatureUnlock_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
