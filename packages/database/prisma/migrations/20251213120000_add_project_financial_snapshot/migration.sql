CREATE TABLE "ProjectFinancialSnapshot" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "projectId" TEXT NOT NULL,
  "estimateVersionId" TEXT NOT NULL,
  "totalRcvClaim" DOUBLE PRECISION NOT NULL,
  "totalAcvClaim" DOUBLE PRECISION NOT NULL,
  "workCompleteRcv" DOUBLE PRECISION NOT NULL,
  "acvReturn" DOUBLE PRECISION NOT NULL,
  "opRate" DOUBLE PRECISION NOT NULL,
  "acvOP" DOUBLE PRECISION NOT NULL,
  "totalDueWorkBillable" DOUBLE PRECISION NOT NULL,
  "depositRate" DOUBLE PRECISION NOT NULL,
  "depositBaseline" DOUBLE PRECISION NOT NULL,
  "billedToDate" DOUBLE PRECISION NOT NULL,
  "duePayable" DOUBLE PRECISION NOT NULL,
  "dueAmount" DOUBLE PRECISION NOT NULL,
  "snapshotDate" TIMESTAMPTZ NOT NULL,
  "computedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ProjectFinancialSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectFinancialSnapshot_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ProjectFinancialSnapshot_project_estimate_date_idx"
  ON "ProjectFinancialSnapshot" ("projectId", "estimateVersionId", "snapshotDate");