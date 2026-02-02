-- CreateEnum (idempotent for existing databases)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentTemplateType') THEN
        CREATE TYPE "DocumentTemplateType" AS ENUM ('INVOICE', 'QUOTE', 'SOP', 'GENERIC');
    END IF;
END $$;

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "DocumentTemplateType" NOT NULL DEFAULT 'GENERIC',
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currentVersionId" TEXT,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "label" TEXT,
    "notes" TEXT,
    "html" TEXT NOT NULL,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "DocumentTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_currentVersionId_key" ON "DocumentTemplate"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_company_code_key" ON "DocumentTemplate"("companyId", "code");

-- CreateIndex
CREATE INDEX "DocumentTemplate_company_idx" ON "DocumentTemplate"("companyId");

-- CreateIndex
CREATE INDEX "DocumentTemplate_company_type_idx" ON "DocumentTemplate"("companyId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "DocTemplateVersion_template_version_no" ON "DocumentTemplateVersion"("templateId", "versionNo");

-- CreateIndex
CREATE INDEX "DocTemplateVersion_template_idx" ON "DocumentTemplateVersion"("templateId");

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "DocumentTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplateVersion" ADD CONSTRAINT "DocumentTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
