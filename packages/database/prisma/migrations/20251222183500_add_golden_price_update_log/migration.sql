-- Log Golden price list updates driven by Xact RAW imports

CREATE TABLE "GoldenPriceUpdateLog" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "companyId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "estimateVersionId" TEXT NOT NULL,
  "userId" TEXT,
  "updatedCount" INTEGER NOT NULL,
  "avgDelta" DOUBLE PRECISION NOT NULL,
  "avgPercentDelta" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "GoldenPriceUpdateLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GoldenPriceUpdateLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GoldenPriceUpdateLog_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GoldenPriceUpdateLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "GoldenPriceUpdateLog_company_created_idx"
  ON "GoldenPriceUpdateLog" ("companyId", "createdAt");

CREATE INDEX "GoldenPriceUpdateLog_project_created_idx"
  ON "GoldenPriceUpdateLog" ("projectId", "createdAt");