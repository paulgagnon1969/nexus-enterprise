-- AlterTable (idempotent)
ALTER TABLE "ProjectFile" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "ProjectFile_company_project_hash_idx" ON "ProjectFile"("companyId", "projectId", "contentHash");
