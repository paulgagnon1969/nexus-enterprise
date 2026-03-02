-- CreateEnum
CREATE TYPE "TemplateSourceType" AS ENUM ('MANUAL', 'IMPORTED_DOCX', 'IMPORTED_PDF', 'IMPORTED_IMAGE', 'IMPORTED_HTML');

-- AlterTable
ALTER TABLE "AgreementTemplate" ADD COLUMN     "originalFileUrl" TEXT,
ADD COLUMN     "overlayFields" JSONB,
ADD COLUMN     "pageImageUrls" JSONB,
ADD COLUMN     "sourceType" "TemplateSourceType" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "AgreementTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "variables" JSONB,
    "overlayFields" JSONB,
    "changeNote" TEXT,
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgreementTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgreementTemplateVersion_template_time_idx" ON "AgreementTemplateVersion"("templateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgreementTemplateVersion_templateId_versionNo_key" ON "AgreementTemplateVersion"("templateId", "versionNo");

-- AddForeignKey
ALTER TABLE "AgreementTemplateVersion" ADD CONSTRAINT "AgreementTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AgreementTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementTemplateVersion" ADD CONSTRAINT "AgreementTemplateVersion_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
