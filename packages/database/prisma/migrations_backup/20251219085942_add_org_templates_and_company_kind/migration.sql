-- CreateEnum
CREATE TYPE "CompanyKind" AS ENUM ('SYSTEM', 'ORGANIZATION');

-- AlterEnum
ALTER TYPE "UserType" ADD VALUE 'APPLICANT';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "kind" "CompanyKind" NOT NULL DEFAULT 'ORGANIZATION',
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "templateVersionId" TEXT;

-- CreateTable
CREATE TABLE "OrganizationTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currentVersionId" TEXT,

    CONSTRAINT "OrganizationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "dayKey" TEXT NOT NULL,
    "label" TEXT,
    "notes" TEXT,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "OrganizationTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationTemplateModule" (
    "id" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "moduleCode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "configJson" JSONB,

    CONSTRAINT "OrganizationTemplateModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationTemplateArticle" (
    "id" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OrganizationTemplateArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationModuleOverride" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "moduleCode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "configJson" JSONB,

    CONSTRAINT "OrganizationModuleOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTemplate_code_key" ON "OrganizationTemplate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTemplate_currentVersionId_key" ON "OrganizationTemplate"("currentVersionId");

-- CreateIndex
CREATE INDEX "OrgTemplateVersion_template_idx" ON "OrganizationTemplateVersion"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTemplateVersion_templateId_dayKey_key" ON "OrganizationTemplateVersion"("templateId", "dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTemplateVersion_templateId_versionNo_key" ON "OrganizationTemplateVersion"("templateId", "versionNo");

-- CreateIndex
CREATE INDEX "OrgTemplateModule_version_idx" ON "OrganizationTemplateModule"("templateVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTemplateModule_templateVersionId_moduleCode_key" ON "OrganizationTemplateModule"("templateVersionId", "moduleCode");

-- CreateIndex
CREATE INDEX "OrgTemplateArticle_version_idx" ON "OrganizationTemplateArticle"("templateVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTemplateArticle_templateVersionId_slug_key" ON "OrganizationTemplateArticle"("templateVersionId", "slug");

-- CreateIndex
CREATE INDEX "OrgModuleOverride_company_idx" ON "OrganizationModuleOverride"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationModuleOverride_companyId_moduleCode_key" ON "OrganizationModuleOverride"("companyId", "moduleCode");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OrganizationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "OrganizationTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationTemplate" ADD CONSTRAINT "OrganizationTemplate_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "OrganizationTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationTemplateVersion" ADD CONSTRAINT "OrganizationTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OrganizationTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationTemplateModule" ADD CONSTRAINT "OrganizationTemplateModule_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "OrganizationTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationTemplateArticle" ADD CONSTRAINT "OrganizationTemplateArticle_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "OrganizationTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationModuleOverride" ADD CONSTRAINT "OrganizationModuleOverride_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
