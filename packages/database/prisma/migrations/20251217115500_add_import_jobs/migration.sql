-- Async import job tracking

-- CreateEnum
CREATE TYPE "ImportJobType" AS ENUM ('XACT_RAW', 'XACT_COMPONENTS');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "ImportJob" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "companyId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "type" "ImportJobType" NOT NULL,
  "status" "ImportJobStatus" NOT NULL DEFAULT 'QUEUED',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "message" TEXT,
  "csvPath" TEXT,
  "estimateVersionId" TEXT,
  "resultJson" JSONB,
  "errorJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "ImportJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ImportJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ImportJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ImportJob_company_created_idx" ON "ImportJob" ("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_project_created_idx" ON "ImportJob" ("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_status_created_idx" ON "ImportJob" ("status", "createdAt");
