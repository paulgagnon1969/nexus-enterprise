-- CreateEnum
CREATE TYPE "AgreementCategory" AS ENUM ('CONTINGENCY', 'SUBCONTRACT', 'CHANGE_ORDER', 'SERVICE', 'NDA', 'WORK_AUTHORIZATION', 'OTHER');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'PENDING_SIGNATURES', 'PARTIALLY_SIGNED', 'FULLY_EXECUTED', 'VOIDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SignatoryRole" AS ENUM ('CLIENT', 'CLIENT_2', 'COMPANY_REP', 'CEO', 'WITNESS', 'SUBCONTRACTOR', 'OTHER');

-- CreateEnum
CREATE TYPE "SignatureMethod" AS ENUM ('TYPED', 'DRAWN', 'UPLOADED');

-- CreateEnum
CREATE TYPE "AgreementAuditAction" AS ENUM ('CREATED', 'UPDATED', 'VARIABLES_FILLED', 'SENT_FOR_SIGNATURES', 'VIEWED', 'SIGNED', 'VOIDED', 'EXPIRED', 'DOWNLOADED_PDF');

-- AlterTable
ALTER TABLE "LocalSupplier" ADD COLUMN     "globalSupplierId" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "savedVia" TEXT;

-- CreateTable
CREATE TABLE "GlobalSupplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "category" TEXT,
    "placeId" TEXT,
    "source" TEXT,
    "tenantCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgreementTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "jurisdiction" TEXT,
    "category" "AgreementCategory" NOT NULL DEFAULT 'OTHER',
    "htmlContent" TEXT NOT NULL,
    "variables" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgreementTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "agreementNumber" TEXT NOT NULL,
    "status" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "htmlContent" TEXT,
    "variables" JSONB,
    "dueDate" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "fullyExecutedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgreementSignatory" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "role" "SignatoryRole" NOT NULL DEFAULT 'CLIENT',
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "signedAt" TIMESTAMP(3),
    "signatureData" TEXT,
    "signatureMethod" "SignatureMethod",
    "signatureToken" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgreementSignatory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgreementAuditLog" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "action" "AgreementAuditAction" NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgreementAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GlobalSupplier_placeId_key" ON "GlobalSupplier"("placeId");

-- CreateIndex
CREATE INDEX "GlobalSupplier_geo_idx" ON "GlobalSupplier"("lat", "lng");

-- CreateIndex
CREATE INDEX "GlobalSupplier_category_idx" ON "GlobalSupplier"("category");

-- CreateIndex
CREATE INDEX "AgreementTemplate_company_active_idx" ON "AgreementTemplate"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "AgreementTemplate_category_idx" ON "AgreementTemplate"("category");

-- CreateIndex
CREATE UNIQUE INDEX "AgreementTemplate_companyId_code_key" ON "AgreementTemplate"("companyId", "code");

-- CreateIndex
CREATE INDEX "Agreement_company_status_idx" ON "Agreement"("companyId", "status");

-- CreateIndex
CREATE INDEX "Agreement_company_project_idx" ON "Agreement"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "Agreement_template_idx" ON "Agreement"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_companyId_agreementNumber_key" ON "Agreement"("companyId", "agreementNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AgreementSignatory_signatureToken_key" ON "AgreementSignatory"("signatureToken");

-- CreateIndex
CREATE INDEX "AgreementSignatory_agreement_role_idx" ON "AgreementSignatory"("agreementId", "role");

-- CreateIndex
CREATE INDEX "AgreementSignatory_token_idx" ON "AgreementSignatory"("signatureToken");

-- CreateIndex
CREATE INDEX "AgreementAuditLog_agreement_time_idx" ON "AgreementAuditLog"("agreementId", "createdAt");

-- CreateIndex
CREATE INDEX "LocalSupplier_global_supplier_idx" ON "LocalSupplier"("globalSupplierId");

-- AddForeignKey
ALTER TABLE "LocalSupplier" ADD CONSTRAINT "LocalSupplier_globalSupplierId_fkey" FOREIGN KEY ("globalSupplierId") REFERENCES "GlobalSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementTemplate" ADD CONSTRAINT "AgreementTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementTemplate" ADD CONSTRAINT "AgreementTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AgreementTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementSignatory" ADD CONSTRAINT "AgreementSignatory_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementAuditLog" ADD CONSTRAINT "AgreementAuditLog_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
