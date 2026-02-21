-- CreateEnum
CREATE TYPE "SystemDocumentPublicationTarget" AS ENUM ('ALL_TENANTS', 'SINGLE_TENANT');

-- CreateEnum
CREATE TYPE "TenantDocumentStatus" AS ENUM ('UNRELEASED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ManualStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ManualVersionChangeType" AS ENUM ('INITIAL', 'DOCUMENT_ADDED', 'DOCUMENT_REMOVED', 'DOCUMENT_REORDERED', 'CHAPTER_ADDED', 'CHAPTER_REMOVED', 'CHAPTER_REORDERED', 'METADATA_UPDATED');

-- CreateEnum
CREATE TYPE "ShareLinkType" AS ENUM ('PUBLIC_URL', 'PRIVATE_LINK');

-- CreateTable
CREATE TABLE "SystemDocument" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "subcategory" TEXT,
    "tags" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "currentVersionId" TEXT,
    "publicSlug" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemDocumentVersion" (
    "id" TEXT NOT NULL,
    "systemDocumentId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "contentHash" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemDocumentPublication" (
    "id" TEXT NOT NULL,
    "systemDocumentId" TEXT NOT NULL,
    "systemDocumentVersionId" TEXT NOT NULL,
    "targetType" "SystemDocumentPublicationTarget" NOT NULL,
    "targetCompanyId" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedByUserId" TEXT NOT NULL,
    "retractedAt" TIMESTAMP(3),
    "retractedByUserId" TEXT,

    CONSTRAINT "SystemDocumentPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantDocumentCopy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceSystemDocumentId" TEXT NOT NULL,
    "sourceVersionNo" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "status" "TenantDocumentStatus" NOT NULL DEFAULT 'UNRELEASED',
    "copiedByUserId" TEXT NOT NULL,
    "copiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "internalNotes" TEXT,
    "hasNewerSystemVersion" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantDocumentCopy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantDocumentCopyVersion" (
    "id" TEXT NOT NULL,
    "tenantDocumentCopyId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "contentHash" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantDocumentCopyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantManualCopy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceManualId" TEXT NOT NULL,
    "sourceManualVersion" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "TenantDocumentStatus" NOT NULL DEFAULT 'UNRELEASED',
    "hasNewerSourceVersion" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedByUserId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "internalNotes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantManualCopy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Manual" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ManualStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "publicSlug" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "publishToAllTenants" BOOLEAN NOT NULL DEFAULT false,
    "coverImageUrl" TEXT,
    "iconEmoji" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Manual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualVersion" (
    "id" TEXT NOT NULL,
    "manualId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changeType" "ManualVersionChangeType" NOT NULL,
    "changeNotes" TEXT,
    "structureSnapshot" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualChapter" (
    "id" TEXT NOT NULL,
    "manualId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualChapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualDocument" (
    "id" TEXT NOT NULL,
    "manualId" TEXT NOT NULL,
    "chapterId" TEXT,
    "systemDocumentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "displayTitleOverride" TEXT,
    "addedInManualVersion" INTEGER NOT NULL,
    "removedInManualVersion" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualTargetTag" (
    "id" TEXT NOT NULL,
    "manualId" TEXT NOT NULL,
    "systemTagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualTargetTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentShareLink" (
    "id" TEXT NOT NULL,
    "systemDocumentId" TEXT,
    "manualId" TEXT,
    "shareType" "ShareLinkType" NOT NULL DEFAULT 'PRIVATE_LINK',
    "accessToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "passcode" TEXT,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemDocument_code_key" ON "SystemDocument"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SystemDocument_currentVersionId_key" ON "SystemDocument"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemDocument_publicSlug_key" ON "SystemDocument"("publicSlug");

-- CreateIndex
CREATE INDEX "SystemDocument_category_idx" ON "SystemDocument"("category");

-- CreateIndex
CREATE INDEX "SystemDocument_active_idx" ON "SystemDocument"("active");

-- CreateIndex
CREATE INDEX "SystemDocument_public_idx" ON "SystemDocument"("isPublic");

-- CreateIndex
CREATE INDEX "SystemDocVersion_doc_idx" ON "SystemDocumentVersion"("systemDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemDocVersion_doc_version_key" ON "SystemDocumentVersion"("systemDocumentId", "versionNo");

-- CreateIndex
CREATE INDEX "SystemDocPub_doc_idx" ON "SystemDocumentPublication"("systemDocumentId");

-- CreateIndex
CREATE INDEX "SystemDocPub_company_idx" ON "SystemDocumentPublication"("targetCompanyId");

-- CreateIndex
CREATE INDEX "SystemDocPub_target_active_idx" ON "SystemDocumentPublication"("targetType", "retractedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TenantDocumentCopy_currentVersionId_key" ON "TenantDocumentCopy"("currentVersionId");

-- CreateIndex
CREATE INDEX "TenantDocCopy_company_idx" ON "TenantDocumentCopy"("companyId");

-- CreateIndex
CREATE INDEX "TenantDocCopy_source_idx" ON "TenantDocumentCopy"("sourceSystemDocumentId");

-- CreateIndex
CREATE INDEX "TenantDocCopy_updates_idx" ON "TenantDocumentCopy"("companyId", "hasNewerSystemVersion");

-- CreateIndex
CREATE INDEX "TenantDocCopy_status_idx" ON "TenantDocumentCopy"("companyId", "status");

-- CreateIndex
CREATE INDEX "TenantDocCopyVersion_copy_idx" ON "TenantDocumentCopyVersion"("tenantDocumentCopyId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantDocCopyVersion_copy_version_key" ON "TenantDocumentCopyVersion"("tenantDocumentCopyId", "versionNo");

-- CreateIndex
CREATE INDEX "TenantManualCopy_company_idx" ON "TenantManualCopy"("companyId");

-- CreateIndex
CREATE INDEX "TenantManualCopy_source_idx" ON "TenantManualCopy"("sourceManualId");

-- CreateIndex
CREATE INDEX "TenantManualCopy_updates_idx" ON "TenantManualCopy"("companyId", "hasNewerSourceVersion");

-- CreateIndex
CREATE UNIQUE INDEX "Manual_code_key" ON "Manual"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Manual_publicSlug_key" ON "Manual"("publicSlug");

-- CreateIndex
CREATE INDEX "Manual_status_idx" ON "Manual"("status");

-- CreateIndex
CREATE INDEX "Manual_public_idx" ON "Manual"("isPublic");

-- CreateIndex
CREATE INDEX "ManualVersion_manual_idx" ON "ManualVersion"("manualId");

-- CreateIndex
CREATE UNIQUE INDEX "ManualVersion_manual_version_key" ON "ManualVersion"("manualId", "version");

-- CreateIndex
CREATE INDEX "ManualChapter_manual_order_idx" ON "ManualChapter"("manualId", "sortOrder");

-- CreateIndex
CREATE INDEX "ManualDocument_chapter_order_idx" ON "ManualDocument"("manualId", "chapterId", "sortOrder");

-- CreateIndex
CREATE INDEX "ManualDocument_doc_idx" ON "ManualDocument"("systemDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "ManualDocument_manual_doc_version_key" ON "ManualDocument"("manualId", "systemDocumentId", "removedInManualVersion");

-- CreateIndex
CREATE INDEX "ManualTargetTag_manual_idx" ON "ManualTargetTag"("manualId");

-- CreateIndex
CREATE INDEX "ManualTargetTag_tag_idx" ON "ManualTargetTag"("systemTagId");

-- CreateIndex
CREATE UNIQUE INDEX "ManualTargetTag_manual_tag_key" ON "ManualTargetTag"("manualId", "systemTagId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentShareLink_accessToken_key" ON "DocumentShareLink"("accessToken");

-- CreateIndex
CREATE INDEX "DocShareLink_token_idx" ON "DocumentShareLink"("accessToken");

-- CreateIndex
CREATE INDEX "DocShareLink_doc_idx" ON "DocumentShareLink"("systemDocumentId");

-- CreateIndex
CREATE INDEX "DocShareLink_manual_idx" ON "DocumentShareLink"("manualId");

-- AddForeignKey
ALTER TABLE "SystemDocument" ADD CONSTRAINT "SystemDocument_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "SystemDocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemDocument" ADD CONSTRAINT "SystemDocument_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemDocumentVersion" ADD CONSTRAINT "SystemDocumentVersion_systemDocumentId_fkey" FOREIGN KEY ("systemDocumentId") REFERENCES "SystemDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemDocumentVersion" ADD CONSTRAINT "SystemDocumentVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemDocumentPublication" ADD CONSTRAINT "SystemDocumentPublication_systemDocumentId_fkey" FOREIGN KEY ("systemDocumentId") REFERENCES "SystemDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemDocumentPublication" ADD CONSTRAINT "SystemDocumentPublication_systemDocumentVersionId_fkey" FOREIGN KEY ("systemDocumentVersionId") REFERENCES "SystemDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemDocumentPublication" ADD CONSTRAINT "SystemDocumentPublication_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemDocumentPublication" ADD CONSTRAINT "SystemDocumentPublication_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemDocumentPublication" ADD CONSTRAINT "SystemDocumentPublication_retractedByUserId_fkey" FOREIGN KEY ("retractedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantDocumentCopy" ADD CONSTRAINT "TenantDocumentCopy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantDocumentCopy" ADD CONSTRAINT "TenantDocumentCopy_sourceSystemDocumentId_fkey" FOREIGN KEY ("sourceSystemDocumentId") REFERENCES "SystemDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantDocumentCopy" ADD CONSTRAINT "TenantDocumentCopy_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "TenantDocumentCopyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantDocumentCopy" ADD CONSTRAINT "TenantDocumentCopy_copiedByUserId_fkey" FOREIGN KEY ("copiedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantDocumentCopy" ADD CONSTRAINT "TenantDocumentCopy_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantDocumentCopyVersion" ADD CONSTRAINT "TenantDocumentCopyVersion_tenantDocumentCopyId_fkey" FOREIGN KEY ("tenantDocumentCopyId") REFERENCES "TenantDocumentCopy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantDocumentCopyVersion" ADD CONSTRAINT "TenantDocumentCopyVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantManualCopy" ADD CONSTRAINT "TenantManualCopy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantManualCopy" ADD CONSTRAINT "TenantManualCopy_sourceManualId_fkey" FOREIGN KEY ("sourceManualId") REFERENCES "Manual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantManualCopy" ADD CONSTRAINT "TenantManualCopy_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantManualCopy" ADD CONSTRAINT "TenantManualCopy_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Manual" ADD CONSTRAINT "Manual_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualVersion" ADD CONSTRAINT "ManualVersion_manualId_fkey" FOREIGN KEY ("manualId") REFERENCES "Manual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualVersion" ADD CONSTRAINT "ManualVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualChapter" ADD CONSTRAINT "ManualChapter_manualId_fkey" FOREIGN KEY ("manualId") REFERENCES "Manual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualDocument" ADD CONSTRAINT "ManualDocument_manualId_fkey" FOREIGN KEY ("manualId") REFERENCES "Manual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualDocument" ADD CONSTRAINT "ManualDocument_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "ManualChapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualDocument" ADD CONSTRAINT "ManualDocument_systemDocumentId_fkey" FOREIGN KEY ("systemDocumentId") REFERENCES "SystemDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualTargetTag" ADD CONSTRAINT "ManualTargetTag_manualId_fkey" FOREIGN KEY ("manualId") REFERENCES "Manual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualTargetTag" ADD CONSTRAINT "ManualTargetTag_systemTagId_fkey" FOREIGN KEY ("systemTagId") REFERENCES "SystemTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShareLink" ADD CONSTRAINT "DocumentShareLink_systemDocumentId_fkey" FOREIGN KEY ("systemDocumentId") REFERENCES "SystemDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShareLink" ADD CONSTRAINT "DocumentShareLink_manualId_fkey" FOREIGN KEY ("manualId") REFERENCES "Manual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShareLink" ADD CONSTRAINT "DocumentShareLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
